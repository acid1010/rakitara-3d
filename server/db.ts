import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export function createDb(connectionString: string) {
  const schema = new URL(connectionString).searchParams.get("schema") ?? "public";
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, options: "-c timezone=UTC" }, { schema }) });
}

export type Db = ReturnType<typeof createDb>;
export type Tx = Prisma.TransactionClient;

export async function atomic<T>(db: Db, action: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(action, { isolationLevel: "Serializable", timeout: 10000 });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}
