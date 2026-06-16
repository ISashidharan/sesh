import type {
  CreateSeshTypeInput,
  UpdateSeshTypeInput,
} from "@sesh/shared";
import { notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

export function listSeshTypes(
  tenantId: string,
  opts: { activeOnly?: boolean } = {},
) {
  return prisma.seshType.findMany({
    where: { tenantId, ...(opts.activeOnly ? { active: true } : {}) },
    orderBy: { createdAt: "asc" },
  });
}

export async function getSeshType(tenantId: string, id: string) {
  const seshType = await prisma.seshType.findFirst({ where: { id, tenantId } });
  if (!seshType) throw notFound("Sesh type not found");
  return seshType;
}

export function createSeshType(tenantId: string, input: CreateSeshTypeInput) {
  return prisma.seshType.create({ data: { tenantId, ...input } });
}

export async function updateSeshType(
  tenantId: string,
  id: string,
  input: UpdateSeshTypeInput,
) {
  await getSeshType(tenantId, id);
  return prisma.seshType.update({ where: { id }, data: input });
}

export async function deleteSeshType(tenantId: string, id: string) {
  await getSeshType(tenantId, id);
  await prisma.seshType.delete({ where: { id } });
}
