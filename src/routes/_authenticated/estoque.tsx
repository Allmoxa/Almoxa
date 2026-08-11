import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { currency, qty, slugSku, type Product } from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/estoque")({
  component: EstoquePage;
});
