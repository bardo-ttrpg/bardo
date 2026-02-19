import { SignIn } from "@clerk/nextjs";

export const metadata = {
	title: "Sign in",
};

export default function SignInPage() {
	return (
		<div className="flex min-h-[calc(100vh-2.75rem)] items-center justify-center">
			<SignIn
				path="/sign-in"
				routing="path"
				signUpUrl="/sign-up"
				forceRedirectUrl="/dashboard"
			/>
		</div>
	);
}
