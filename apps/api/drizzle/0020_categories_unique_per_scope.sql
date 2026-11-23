ALTER TABLE "categories" DROP CONSTRAINT "categories_name_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "categories_scope_name_lower_uq" ON "categories" USING btree ("scope",lower("name"));