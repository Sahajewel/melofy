import z from "zod";

export const signupSchema = z
  .object({
    name: z.string().min(2, "The name must be at least 2 characters long"),
    email: z.email("Invalid email address"),
    password: z
      .string()
      .min(8, "The password must be at least 8 characters long")
      .regex(
        /[A-Z]/,
        "The password must contain at least one character uppercase letter",
      )
      .regex(/[0-9]/, "The password must be at leat one number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Password do not match",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(1, "Password is rewuired"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export type SignUpInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
