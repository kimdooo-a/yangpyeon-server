CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer,
	`action` text NOT NULL,
	`ip` text NOT NULL,
	`path` text,
	`method` text,
	`status_code` integer,
	`user_agent` text,
	`detail` text
);
--> statement-breakpoint
CREATE TABLE `ip_whitelist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip` text NOT NULL,
	`description` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ip_whitelist_ip_unique` ON `ip_whitelist` (`ip`);--> statement-breakpoint
CREATE TABLE `metrics_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer,
	`cpu_usage` integer,
	`memory_used` integer,
	`memory_total` integer
);
