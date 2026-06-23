CREATE TABLE `pages_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_id` integer NOT NULL,
	`version_data` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
ALTER TABLE `pages` ADD `published_version_id` integer;