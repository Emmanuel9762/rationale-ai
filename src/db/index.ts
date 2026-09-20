import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { Agent, fetch as undiciFetch } from "undici";

const agent = new Agent({
  connect: {
    family: 4,
  },
});

neonConfig.fetchFunction = (
  input: Parameters<typeof undiciFetch>[0],
  init?: Parameters<typeof undiciFetch>[1],
) =>
  undiciFetch(input, {
    ...init,
    dispatcher: agent,
  });

const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql);
