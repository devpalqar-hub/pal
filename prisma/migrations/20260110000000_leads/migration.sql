-- AlterTable
ALTER TABLE `notifications` MODIFY `type` ENUM('TASK_ASSIGNED', 'TASK_REVIEW_REQUESTED', 'TASK_COMPLETED', 'TASK_APPROVED', 'TASK_REJECTED', 'TASK_ENDED', 'TASK_DECLINED', 'TASK_COMMENT', 'REQUEST_RECEIVED', 'REQUEST_REJECTED', 'REQUEST_RESUBMITTED', 'REQUEST_APPROVED', 'REQUEST_COMPLETED', 'MEETING_INVITE', 'MEETING_UPDATED', 'MEETING_CANCELLED', 'MEETING_REMINDER', 'LEAVE_DECIDED', 'LEAD_ASSIGNED', 'LEAD_FOLLOW_UP_ASSIGNED', 'LEAD_FOLLOW_UP_DUE') NOT NULL;

-- AlterTable
ALTER TABLE `meetings` ADD COLUMN `googleEventId` VARCHAR(191) NULL,
    ADD COLUMN `googleHtmlLink` TEXT NULL,
    ADD COLUMN `leadId` INTEGER NULL,
    ADD COLUMN `reminderSentAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `meeting_guests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `meetingId` INTEGER NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `response` ENUM('INVITED', 'ACCEPTED', 'DECLINED', 'TENTATIVE') NOT NULL DEFAULT 'INVITED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `meeting_guests_meetingId_email_key`(`meetingId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `google_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `refreshTokenEnc` TEXT NOT NULL,
    `accessToken` TEXT NULL,
    `expiresAt` DATETIME(3) NULL,
    `calendarId` VARCHAR(191) NOT NULL DEFAULT 'primary',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `google_accounts_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leads` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `company` VARCHAR(191) NULL,
    `designation` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `website` VARCHAR(191) NULL,
    `source` ENUM('WEBSITE', 'SEARCH_ENGINE', 'REFERRAL', 'SOCIAL_MEDIA', 'EMAIL_CAMPAIGN', 'COLD_CALL', 'EVENT', 'PARTNER', 'ADVERTISEMENT', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `stage` ENUM('NEW', 'CONTACTED', 'MQL', 'SQL', 'DEMO_SCHEDULED', 'DEMO_DONE', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST') NOT NULL DEFAULT 'NEW',
    `temperature` ENUM('HOT', 'WARM', 'COLD') NOT NULL DEFAULT 'WARM',
    `value` DECIMAL(14, 2) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'INR',
    `requirement` TEXT NULL,
    `tags` VARCHAR(191) NULL,
    `lostReason` TEXT NULL,
    `ownerId` INTEGER NOT NULL,
    `createdById` INTEGER NOT NULL,
    `nextFollowUpAt` DATETIME(3) NULL,
    `lastActivityAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `wonAt` DATETIME(3) NULL,
    `lostAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `leads_ownerId_stage_idx`(`ownerId`, `stage`),
    INDEX `leads_stage_idx`(`stage`),
    INDEX `leads_nextFollowUpAt_idx`(`nextFollowUpAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_activities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `leadId` INTEGER NOT NULL,
    `type` ENUM('CREATED', 'UPDATED', 'STAGE_CHANGED', 'TEMPERATURE_CHANGED', 'OWNER_CHANGED', 'NOTE', 'CALL', 'EMAIL', 'WHATSAPP', 'MEETING_SCHEDULED', 'MEETING_CANCELLED', 'FOLLOW_UP_SCHEDULED', 'FOLLOW_UP_DONE', 'FOLLOW_UP_CANCELLED') NOT NULL,
    `actorId` INTEGER NOT NULL,
    `fromValue` VARCHAR(191) NULL,
    `toValue` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `meetingId` INTEGER NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `lead_activities_leadId_at_idx`(`leadId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_follow_ups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `leadId` INTEGER NOT NULL,
    `type` ENUM('CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'OTHER') NOT NULL DEFAULT 'CALL',
    `dueAt` DATETIME(3) NOT NULL,
    `note` TEXT NULL,
    `assigneeId` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'DONE', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `outcome` TEXT NULL,
    `doneAt` DATETIME(3) NULL,
    `reminderSentAt` DATETIME(3) NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `lead_follow_ups_assigneeId_status_dueAt_idx`(`assigneeId`, `status`, `dueAt`),
    INDEX `lead_follow_ups_leadId_status_idx`(`leadId`, `status`),
    INDEX `lead_follow_ups_status_dueAt_idx`(`status`, `dueAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `meetings_leadId_idx` ON `meetings`(`leadId`);

-- AddForeignKey
ALTER TABLE `meetings` ADD CONSTRAINT `meetings_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `leads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meeting_guests` ADD CONSTRAINT `meeting_guests_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `meetings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `google_accounts` ADD CONSTRAINT `google_accounts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_activities` ADD CONSTRAINT `lead_activities_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_activities` ADD CONSTRAINT `lead_activities_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_follow_ups` ADD CONSTRAINT `lead_follow_ups_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_follow_ups` ADD CONSTRAINT `lead_follow_ups_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

