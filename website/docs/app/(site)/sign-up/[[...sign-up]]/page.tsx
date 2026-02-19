import { SignUp } from "@clerk/nextjs";

export const metadata = {
	title: "Sign up",
};

export default function SignUpPage() {
	return (
		<div className="flex min-h-[calc(100vh-2.75rem)] items-center justify-center">
			<SignUp
				path="/sign-up"
				routing="path"
				signInUrl="/sign-in"
				forceRedirectUrl="/dashboard"
			/>
		</div>
	);
}
