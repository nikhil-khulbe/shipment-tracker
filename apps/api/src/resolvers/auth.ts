import * as authService from "../services/authService.js";

export const authMutations = {
  login: (_parent: unknown, args: { email: string; password: string }) => {
    return authService.login(args.email, args.password);
  },
};
