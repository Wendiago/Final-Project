import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { useToast } from "@/hooks/use-toast";
import wretch from "wretch";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { EmailforgotPasswordSchema } from "../../_data/auth-schema";
import { ApiResponse } from "@/types/auth";

interface SendOTPProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (email: string) => void;
}

const SendOTPDialog: React.FC<SendOTPProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { toast } = useToast();
  const router = useRouter();

  const form = useForm({
    resolver: zodResolver(EmailforgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const handleSubmit = async (data: { email: string }) => {
    setIsLoading(true);
    try {
      const response: ApiResponse<null> = await wretch(
        "/api/access/forgot-password/send-otp"
      )
        .post({ email: data.email })
        .json();

      if (response.status === 200) {
        toast({
          variant: "success",
          title: "Success",
          description: response.message,
        });
        onSuccess(data.email);
      } else {
        toast({
          variant: "destructive",
          title: "Oops! Something went wrong.",
          description: response.message,
        });
      }
    } catch (error: any) {
      const errorResponse: ApiResponse<null> = error?.json || {};
      toast({
        variant: "destructive",
        title: "Oops! Something went wrong.",
        description: errorResponse.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[300px] md:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Enter Email</DialogTitle>
          <DialogDescription>
            Please enter the email address you used to sign up.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="grid gap-4"
          >
            {/* Email Field */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="email">Email</FormLabel>
                  <FormControl>
                    <Input
                      className="border-[#a996f6] focus:outline-none focus-visible:outline-none focus-visible:ring-0"
                      id="email"
                      type="email"
                      placeholder="m@example@gmail.com"
                      required
                      {...field}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isLoading}>
                Send OTP
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default SendOTPDialog;
