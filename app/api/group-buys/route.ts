import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { adminCookieName, isValidAdminToken } from "@/lib/admin-auth";

type PriceTierInput = {
  minQuantity?: unknown;
  maxQuantity?: unknown;
  unitPrice?: unknown;
};

type ProductInput = {
  name?: unknown;
  description?: unknown;
  unit?: unknown;
  maxQuantity?: unknown;
};

export async function GET() {
  try {
