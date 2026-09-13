#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { materializeAuthoring } from "./index";

const file = process.argv[2];
if (!file) throw new Error("usage: bun authoring/cli.ts <reviewed-input.json>");
const input = JSON.parse(await readFile(file, "utf8"));
const out = await materializeAuthoring(input);
console.log(JSON.stringify({ recipeDir: out.recipeDir, providerId: out.recipe.providerId, appcallId: out.recipe.appcallId }, null, 2));
