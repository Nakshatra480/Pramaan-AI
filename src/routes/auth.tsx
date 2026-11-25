import { Outlet } from "react-router";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { ForgotPasswordForm, LoginForm, ResetPasswordForm, SignupForm, VerifyForm } from "@/components/auth/AuthForms";
import { Onboarding as OnboardingFlow } from "@/components/auth/Onboarding";
import { usePageTitle } from "@/lib/navigation";

export function AuthFrame() {
  return (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  );
}

export function Login() {
  usePageTitle("Sign in");
  return <LoginForm />;
}

export function Signup() {
  usePageTitle("Create account");
  return <SignupForm />;
}

export function ForgotPassword() {
  usePageTitle("Forgot password");
  return <ForgotPasswordForm />;
}

export function ResetPassword() {
  usePageTitle("Reset password");
  return <ResetPasswordForm />;
}

export function Verify() {
  usePageTitle("Verify email");
  return <VerifyForm />;
}

export function Onboarding() {
  usePageTitle("Welcome");
  return <OnboardingFlow />;
}
