CREATE TABLE `site_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`site_name` text,
	`tagline` text,
	`logo_url` text,
	`favicon_url` text,
	`brand_color` text,
	`secondary_color` text,
	`tertiary_color` text,
	`font_pairing` text,
	`homepage_layout` text,
	`dark_mode` integer DEFAULT false NOT NULL,
	`theme` text,
	`spacing_preset` text,
	`type_tokens` text,
	`nav_background` text,
	`nav_text_color` text,
	`footer_background` text,
	`footer_text_color` text,
	`page_background` text,
	`surface_background` text,
	`contact_email` text,
	`contact_phone` text,
	`contact_address` text,
	`social_links` text,
	`nav_links` text,
	`meta_description` text,
	`default_og_image_url` text,
	`disable_indexing` integer DEFAULT false NOT NULL,
	`primary_domain` text,
	`domain_provider` text,
	`nameserver_delegated` integer DEFAULT false NOT NULL,
	`domain_registered_via_citadel` integer DEFAULT false NOT NULL,
	`cf_account_id` text,
	`cf_api_token_scoped` integer DEFAULT false NOT NULL,
	`features` text,
	CONSTRAINT "site_settings_singleton" CHECK("site_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'owner' NOT NULL,
	`first_name` text,
	`last_name` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);