import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";
import { authConfig } from "./config";

let instance: ReturnType<typeof createNeonAuth> | undefined;
export function getAuth() {
  return instance ??= createNeonAuth(authConfig());
}
