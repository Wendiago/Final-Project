const BcryptHelper = require("../utils/bcrypt.helper");
const {
  ConflictResponse,
  InternalServerErrorResponse,
  BadRequestResponse,
} = require("../response/error");
const UserFilter = require("../utils/user.filter");
const UserModel = require("../models/userModel");
const AccessModel = require("../models/accessModel");
const JWTHelper = require("../utils/jwt.helper");
const EmailHelper = require("../utils/email.helper");
const { generateRSAKeysForAccess } = require("../utils/crypto.util");
const MongooseUtil = require("../utils/mongoose.util");
const { generateOtpCode } = require("../utils/otpCode.util");
const GoogleHelper = require("../utils/google.helper");

class AuthService {
  constructor() {
    this.userModel = UserModel;
    this.accessModel = AccessModel;
  }

  async handleSignup(email, password) {
    const existingUser = await this.userModel.findOne({ email });
    if (existingUser) {
      throw new ConflictResponse("Email already exists", 1010105);
    }

    const hashedPassword = await BcryptHelper.hash(password);

    let user = await this.userModel.create({
      email,
      password: hashedPassword,
    });
    const { privateKey, publicKey } = generateRSAKeysForAccess();
    await this.accessModel.create({
      user_id: user?._id,
      public_key: publicKey.toString(),
      private_key: privateKey.toString(),
    });

    return UserFilter.makeBasicFilter(user);
  }

  async handleLogin(email, password) {
    const foundUser = await this.userModel
      .findOne({ email, type_login: "local" })
      .lean();

    //console.log(foundUser);
    if (!foundUser) {
      throw new ConflictResponse("Email or password is incorrect", 1010205);
    }
    if (foundUser?.isVerified === false) {
      throw new ConflictResponse("Account is not verified", 1010210);
    }

    const isPasswordMatched = await BcryptHelper.compare(
      password,
      foundUser?.password
    );
    if (isPasswordMatched === false) {
      throw new ConflictResponse("Email or password is incorrect", 1010206);
    }

    const foundAccess = await this.accessModel.findOne({
      user_id: foundUser?._id,
    });
    if (!foundAccess) {
      throw new ConflictResponse("Invalid access to account", 1010207);
    }

    const privateKey = foundAccess?.private_key;
    if (!foundAccess?.public_key || !privateKey) {
      throw new ConflictResponse("Something went wrong", 1010208);
    }

    const accessToken = JWTHelper.generateAccessToken(foundUser, privateKey);
    const refreshToken = JWTHelper.generateRefreshToken(foundUser, privateKey);

    await this.accessModel.updateOne(
      { user_id: foundUser?._id },
      {
        refresh_token: refreshToken,
      }
    );

    return {
      user: UserFilter.makeBasicFilter(foundUser),
      accessToken,
      refreshToken,
    };
  }

  async handleInvokeNewTokens(userId, accessToken, refreshToken) {
    const foundUser = await this.userModel
      .findById(MongooseUtil.convertToMongooseObjectIdType(userId))
      .lean();
    if (!foundUser) {
      throw new ConflictResponse("User not found", 1010305);
    }

    const foundAccess = await this.accessModel.findOne({
      user_id: MongooseUtil.convertToMongooseObjectIdType(userId),
    });
    if (!foundAccess) {
      throw new ConflictResponse("Invalid access to account", 1010306);
    } else if (!foundAccess.public_key || !foundAccess.private_key) {
      throw new ConflictResponse("Something went wrong", 1010307);
    }

    try {
      JWTHelper.verifyToken(accessToken, foundAccess.public_key);
      // If no error <=> token is still valid ==> cannot invoke new tokens
      throw new BadRequestResponse("Access token is still valid", 1010308);
    } catch (error) {
      if (JWTHelper.checkIfTokenExpiredError(error) === false) {
        throw new InternalServerErrorResponse("Something went wrong", 1010309);
      }
    }

    let decodedRefreshToken = {
      id: null,
      createdAt: null,
    };
    try {
      decodedRefreshToken = JWTHelper.verifyToken(
        refreshToken,
        foundAccess.public_key
      );
      if (
        !decodedRefreshToken ||
        !decodedRefreshToken?.id ||
        !decodedRefreshToken?.createdAt
      ) {
        throw new BadRequestResponse("Invalid refresh token", 1010310);
      } else if (decodedRefreshToken.id !== userId) {
        throw new BadRequestResponse("Invalid refresh token", 1010311);
      } else if (foundAccess.refresh_token_used?.length > 0) {
        const foundUsedTokenIndex = foundAccess.refresh_token_used.findIndex(
          (t) => t?.token === refreshToken
        );
        if (foundUsedTokenIndex !== -1) {
          throw new BadRequestResponse("Invalid refresh token", 1010312);
        }
      } else if (foundAccess.refresh_token !== refreshToken) {
        throw new BadRequestResponse("Invalid refresh token", 1010313);
      }
    } catch (error) {
      throw new BadRequestResponse("Invalid refresh token", 1010314);
    }

    const newAccessToken = JWTHelper.generateAccessToken(
      foundUser,
      foundAccess.private_key
    );
    const newRefreshToken = JWTHelper.generateRefreshToken(
      foundUser,
      foundAccess.private_key
    );

    await this.accessModel.updateOne(
      { user_id: foundUser?.id },
      {
        $set: { refresh_token: newRefreshToken },
        $push: {
          refresh_token_used: {
            token: refreshToken,
            createdAt: decodedRefreshToken.createdAt,
            expiredAt: new Date(),
          },
        },
      }
    );

    return {
      user: UserFilter.makeBasicFilter(foundUser),
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async sendOTPToVerifyEmail(userEmail) {
    const otp = generateOtpCode();
    const user = await this.userModel.findOne({ email: userEmail });
    if (!user) {
      throw new BadRequestResponse("User not found", 1010403);
    } else if (user.isVerified === true) {
      throw new BadRequestResponse("Email is already verified", 1010404);
    }

    const foundAccess = await this.accessModel.findOne({
      user_id: MongooseUtil.convertToMongooseObjectIdType(user.id),
    });
    if (!foundAccess) {
      throw new BadRequestResponse("User not found", 1010405);
    }
    const now = new Date();
    const otpCount = foundAccess.otp_count || 0;
    const lastOtpSent = foundAccess.last_otp_sent;

    // Check số lần gửi OTP
    if (otpCount >= 5 && now - lastOtpSent < 3600000) {
      throw new BadRequestResponse(
        "Reached the maximum number of OTP requests per hour",
        1010409
      );
    }

    // Kiểm tra delay giữa các lần gửi
    if (lastOtpSent && now - lastOtpSent < 30000) {
      throw new BadRequestResponse(
        "Please wait 30 seconds before requesting another OTP.",
        1010410
      );
    }

    try {
      await EmailHelper.sendEmail(user.email, otp.code);
      let result = await this.saveOTP(user.id, otp, now, otpCount);
      if (!result) {
        throw new ConflictResponse("Something went wrong", 1010406);
      }
    } catch (emailError) {
      throw new InternalServerErrorResponse(
        "Failed to send OTP via email",
        1010407
      );
    }
  }

  async saveOTP(userId, otp, now, otpCount) {
    return await this.accessModel.updateOne(
      { user_id: MongooseUtil.convertToMongooseObjectIdType(userId) },
      {
        "otp.code": otp.code,
        "otp.expiredAt": otp.expiredAt,
        last_otp_sent: now,
        $inc: { otp_count: 1 },
      }
    );
  }
  async saveOTPResetPassword(userId, otp, now, otpCount) {
    return await this.accessModel.updateOne(
      { user_id: MongooseUtil.convertToMongooseObjectIdType(userId) },
      {
        "otp_reset_password.code": otp.code,
        "otp_reset_password.expiredAt": otp.expiredAt,
        last_otp_reset_password_sent: now,
        $inc: { otp_reset_password_count: 1 },
      }
    );
  }

  async verifyOTP(userEmail, otpCode) {
    const user = await this.userModel.findOne({ email: userEmail });
    if (!user) {
      throw new BadRequestResponse("User not found", 1010505);
    } else if (user.isVerified === true) {
      throw new BadRequestResponse("Email is already verified", 1010506);
    }

    const foundAccess = await this.accessModel.findOne({
      user_id: MongooseUtil.convertToMongooseObjectIdType(user.id),
    });
    if (!foundAccess) {
      throw new ConflictResponse("Something went wrong", 1010507);
    } else if (!foundAccess?.otp?.code || !foundAccess?.otp?.expiredAt) {
      throw new ConflictResponse("OTP code not exists", 1010508);
    }

    const otp = foundAccess.otp;
    if (otp.code !== otpCode) {
      throw new ConflictResponse("OTP code is incorrect", 1010509);
    } else if (new Date() > new Date(otp.expiredAt)) {
      throw new ConflictResponse("OTP code is expired", 101051010);
    }
    //Update verified email status to true
    const newUser = await this.userModel.updateOne(
      { email: user.email },
      {
        isVerified: true,
      },
      { new: true }
    );
    return newUser;
  }

  async loginWithGoogle(idToken) {
    try {
      const userInfo = await GoogleHelper.verifyIdToken(idToken);
      if (!userInfo) {
        throw new BadRequestResponse("Invalid ID Token", 1010602);
      }
      console.log("Auth-service. login with google user info: ", userInfo);
      const user = await this.userModel
        .findOne({ email: userInfo.email })
        .lean();
      if (!user) {
        const newUser = await this.userModel.create({
          email: userInfo?.email,
          name: userInfo?.name,
          photo: userInfo?.picture,
          google_id: userInfo?.googleId,
          type_login: "google",
          isVerified: true,
        });

        const { privateKey, publicKey } = generateRSAKeysForAccess();

        await this.accessModel.create({
          user_id: newUser?._id,
          public_key: publicKey.toString(),
          private_key: privateKey.toString(),
        });

        // Generate tokens
        const accessToken = JWTHelper.generateAccessToken(newUser, privateKey);
        const refreshToken = JWTHelper.generateRefreshToken(
          newUser,
          privateKey
        );
        await this.accessModel.updateOne(
          { user_id: newUser?._id },
          {
            refresh_token: refreshToken,
          }
        );
        return {
          user: UserFilter.makeBasicFilter(newUser),
          accessToken,
          refreshToken,
        };
      } else {
        const foundAccess = await this.accessModel.findOne({
          user_id: user?._id,
        });
        if (!foundAccess) {
          throw new ConflictResponse("Invalid access to account", 1010603);
        }
        const privateKey = foundAccess?.private_key;
        if (!foundAccess?.public_key || !privateKey) {
          throw new ConflictResponse("Something went wrong", 1010604);
        }
        const accessToken = JWTHelper.generateAccessToken(user, privateKey);
        const refreshToken = JWTHelper.generateRefreshToken(user, privateKey);

        await this.accessModel.updateOne(
          { user_id: user?._id },
          {
            refresh_token: refreshToken,
          }
        );
        return {
          user: UserFilter.makeBasicFilter(user),
          accessToken,
          refreshToken,
        };
      }
    } catch (error) {
      throw new InternalServerErrorResponse("Something went wrong", 1010605);
    }
  }

  async handleLogout(user) {
    return await this.accessModel.updateOne(
      { user_id: MongooseUtil.convertToMongooseObjectIdType(user.id) },
      {
        refresh_token: "",
        refresh_token_used: [],
      },
      { new: true }
    );
  }

  async sendOTPToResetPassword(userEmail) {
    const otp = generateOtpCode();
    const user = await this.userModel.findOne({ email: userEmail });
    if (!user) {
      throw new BadRequestResponse("User not found", 1011203);
    }

    const foundAccess = await this.accessModel.findOne({
      user_id: MongooseUtil.convertToMongooseObjectIdType(user.id),
    });
    if (!foundAccess) {
      throw new BadRequestResponse("User not found", 1011204);
    }
    const now = new Date();
    const otpCount = foundAccess.otp_reset_password_count || 0;
    const lastOtpSent = foundAccess.last_otp_reset_password_sent;

    // Check số lần gửi OTP
    if (otpCount >= 5 && now - lastOtpSent < 3600000) {
      throw new BadRequestResponse(
        "Reached the maximum number of OTP requests per hour",
        1011205
      );
    }

    // Kiểm tra delay giữa các lần gửi
    if (lastOtpSent && now - lastOtpSent < 30000) {
      throw new BadRequestResponse(
        "Please wait 30 seconds before requesting another OTP.",
        1011206
      );
    }

    try {
      await EmailHelper.sendResetPasswordEmail(user.email, otp.code);
      let result = await this.saveOTPResetPassword(user.id, otp, now, otpCount);
      if (!result) {
        throw new ConflictResponse("Something went wrong", 1011207);
      }
    } catch (emailError) {
      throw new InternalServerErrorResponse(
        "Failed to send OTP via email",
        1011208
      );
    }
  }
  async confirmOTPToResetPassword(userEmail, otpCode) {
    const user = await this.userModel.findOne({ email: userEmail });
    if (!user) {
      throw new BadRequestResponse("User not found", 1011305);
    }
    const foundAccess = await this.accessModel.findOne({
      user_id: MongooseUtil.convertToMongooseObjectIdType(user.id),
    });
    if (!foundAccess) {
      throw new ConflictResponse("Something went wrong", 1011306);
    } else if (
      !foundAccess?.otp_reset_password?.code ||
      !foundAccess?.otp_reset_password?.expiredAt
    ) {
      throw new ConflictResponse("OTP code not exists", 1011307);
    }

    const otp = foundAccess.otp_reset_password;
    if (otp.code !== otpCode) {
      throw new ConflictResponse("OTP code is incorrect", 1011308);
    } else if (new Date() > new Date(otp.expiredAt)) {
      throw new ConflictResponse("OTP code is expired", 1011309);
    }
    const privateKey = foundAccess?.private_key;
    if (!foundAccess?.public_key || !privateKey) {
      throw new ConflictResponse("Something went wrong", 1011310);
    }

    const resetPasswordToken = JWTHelper.generateResetPasswordToken(
      user,
      privateKey
    );
    await this.accessModel.updateOne(
      { user_id: user?._id },
      {
        reset_password_token: resetPasswordToken,
      }
    );
    return {
      userId: user?._id,
      resetPasswordToken,
    };
  }
  async resetPassword(userId, resetPasswordToken, newPassword) {
    const foundUser = await this.userModel
      .findById(MongooseUtil.convertToMongooseObjectIdType(userId))
      .lean();
    if (!foundUser) {
      throw new ConflictResponse("User not found", 1011408);
    }

    const foundAccess = await this.accessModel.findOne({
      user_id: MongooseUtil.convertToMongooseObjectIdType(userId),
    });
    if (!foundAccess) {
      throw new ConflictResponse("Invalid access to account", 1011409);
    } else if (!foundAccess.public_key || !foundAccess.private_key) {
      throw new ConflictResponse("Something went wrong", 1011410);
    }
    let decodedResetPasswordToken = null;

    try {
      decodedResetPasswordToken = JWTHelper.verifyToken(
        resetPasswordToken,
        foundAccess.public_key
      );
      if (
        !decodedResetPasswordToken ||
        !decodedResetPasswordToken?.userId ||
        decodedResetPasswordToken.userId !== userId
      ) {
        throw new BadRequestResponse("Invalid reset password token", 1011411);
      }
      if (
        decodedResetPasswordToken &&
        decodedResetPasswordToken?.purpose !== "reset_password"
      ) {
        throw new BadRequestResponse("Invalid reset password token", 1011412);
      }
      if (foundAccess.reset_password_token !== resetPasswordToken) {
        throw new BadRequestResponse("Invalid reset password token", 1011413);
      }
      //All conditions are met, update the password
      const hashedPassword = await BcryptHelper.hash(newPassword);

      let result = await this.userModel.updateOne(
        { _id: MongooseUtil.convertToMongooseObjectIdType(userId) },
        {
          password: hashedPassword,
        }
      );

      return UserFilter.makeBasicFilter(result);
    } catch (error) {
      if (JWTHelper.checkIfTokenExpiredError(error) === true) {
        throw new InternalServerErrorResponse("Something went wrong", 1011414);
      }
    }
  }
}
module.exports = AuthService;
