import type { Request, Response, NextFunction } from "express";
import { getUserTier, requireAuth } from "../services/auth";

export async function requireAttorneyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await requireAuth(req, res, async () => {
    const user = (req as any).user as { id: string; tier?: string } | undefined;
    if (!user?.id) {
      res.status(401).json({
        error: "Authentication required.",
        code: "UNAUTHENTICATED",
      });
      return;
    }

    const tier = await getUserTier(user.id);
    if (tier !== "attorney_firm") {
      res.status(403).json({
        error: "Attorney access required.",
        code: "FORBIDDEN",
      });
      return;
    }

    (req as any).user = { ...user, tier };
    next();
  });
}
