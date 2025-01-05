const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const catchAsync = require("../utils/catchAsync");
const User = require("../models/userModel");
const Session = require("../models/sessionModel");
const {
  generateRefreshToken,
  generateAccessToken,
} = require("../utils/generateTokens");
const Email = require("../utils/email");
const setTokenCookies = require("../utils/setTokenCookies");
const AppError = require("../utils/appError");

const grantUserAccessToApp = async (res, user) => {
  const { refreshToken, refreshTokenExp } = await generateRefreshToken(
    user._id
  );
  const { accessToken, accessTokenExp } = generateAccessToken(user._id);
  setTokenCookies(res, accessToken, refreshToken, refreshTokenExp);
};

exports.registerUser = catchAsync(async (req, res, next) => {
  const newUser = await User.create({
    email: req.body.email,
    password: req.body.password,
  });

  const confirmationToken = newUser.createConfirmationToken();
  await newUser.save({ validateBeforeSave: false });

  try {
    const url = `${req.protocol}://${req.get(
      "host"
    )}/confirmation/${confirmationToken}`;
    console.log(url);

    // <a href="${url}">${url}</a>
    const htmlContent = `
    <h1>Hello ${newUser.email.split("@")[0]},</h1>
    <p>You are just one step away from your Final project registration before you can start testing.</p>
    <p>Click on the button below to verify your email & activate your Final project account..</p>
    <a href="${url}">Activate Account</a>
    `;
    await new Email(newUser).send(
      htmlContent,
      "Final project Account Activation"
    );

    res.status(200).json({
      status: "success",
      message: "Token sent to email!",
    });
  } catch (err) {
    console.error(err);
    newUser.confirmationToken = undefined;
    await newUser.save({ validateBeforeSave: false });

    return next(
      new AppError("There was an error sending the email. Try again later!"),
      500
    );
  }
});

exports.confirmSignup = catchAsync(async (req, res, next) => {
  // 1) Get user based on the token
  const hashedToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

  const user = await User.findOne({
    confirmationToken: hashedToken,
  });

  if (!user) {
    throw new AppError("Token is invalid", 401);
  }

  if (!user.isVerified) {
    // user.confirmationToken = undefined;
    user.isVerified = true;
    await user.save();

    await grantUserAccessToApp(res, user);
  }
  res.redirect(`${process.env.API_URL}/private`);
});

exports.loginUser = catchAsync(async (req, res, next) => {
  const { email, password } = req.body; // Get the email and password from the request body

  const user = await User.findOne({ email }).select("+password");

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError("Invalid email or password", 401));
  }

  await grantUserAccessToApp(res, user);

  res.status(200).json({
    status: "success",
    data: {
      user,
    },
  });
});

exports.isLoggedIn = catchAsync(async (req, res, next) => {
  // console.log(req.cookies);
  if (!req.cookies.accessToken || !req.cookies.refreshToken) {
    return next(
      new AppError("You are not logged in. Please log in to get access", 401)
    );
  }

  // 1) Verify token
  const accessTokenPayload = jwt.verify(
    req.cookies.accessToken,
    process.env.JWT_ACCESS_TOKEN_SECRET_KEY
  );

  // 2) Check if user still exists
  const currentUser = await User.findById(accessTokenPayload._id).select(
    "-confirmationToken"
  );
  if (!currentUser) {
    return next(
      new AppError(
        "The user belonging to this token does no longer exist.",
        401
      )
    );
  }

  const refreshToken = await Session.findOne({
    userId: accessTokenPayload._id,
  });

  if (!refreshToken) {
    return next(
      new AppError("Your session has expired. Please log in again.", 401)
    );
  }

  // 3) Check if user changed password after the token was issued
  if (currentUser.changedPasswordAfter(accessTokenPayload.iat)) {
    return next(
      new AppError("User recently changed password! Please log in again.", 401)
    );
  }

  return res.status(200).json({
    status: "success",
    message: "Get user successfully",
    data: currentUser,
  });
});

exports.logout = catchAsync(async (req, res, next) => {
  //Find user
  const { refreshToken } = req.cookies;
  // 1. Check if the refresh token exists in cookies
  if (!refreshToken) {
    return next(new AppError("You are not logged in.", 401));
  }

  // Delete the session using the refresh token
  const session = await Session.findOneAndDelete({ token: refreshToken });

  if (!session) {
    return next(
      new AppError("Session not found. User may already be logged out.", 404)
    );
  }

  // Clear the cookies
  res.setHeader("Set-Cookie", [
    "accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly",
    "refreshToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly",
  ]);

  res.status(200).json({
    status: "success",
    message: "Logged out successfully",
  });
});

// expired token
// eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2NzJjM2FhNzQ1ZjRkYTA3ZDA4NTM2MGIiLCJleHAiOjE3MzA5Njg3NjIsImlhdCI6MTczMDk2ODc0N30.neo_8xJvAYVf5DeUYqsetpmjnUEqqfr6pST78kcRIGM
