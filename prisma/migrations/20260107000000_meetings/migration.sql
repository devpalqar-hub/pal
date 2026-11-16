-- AlterTable
ALTER TABLE `notifications` MODIFY `type` ENUM('TASK_ASSIGNED', 'TASK_REVIEW_REQUESTED', 'TASK_COMPLETED', 'TASK_APPROVED', 'TASK_REJECTED', 'TASK_ENDED', 'TASK_DECLINED', 'REQUEST_RECEIVED', 'REQUEST_REJECTED', 'REQUEST_RESUBMITTED', 'REQUEST_APPROVED', 'REQUEST_COMPLETED', 'MEETING_INVITE', 'MEETING_UPDATED', 'MEETING_CANCELLED', 'LEAVE_DECIDED') NOT NULL;

-- CreateTable
CREATE TABLE `meetings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `agenda` TEXT NULL,
    `link` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `status` ENUM('SCHEDULED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
    `projectId` INTEGER NULL,
    `organizerId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `meetings_startsAt_idx`(`startsAt`),
    INDEX `meetings_organizerId_idx`(`organizerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `meeting_attendees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `meetingId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `response` ENUM('INVITED', 'ACCEPTED', 'DECLINED', 'TENTATIVE') NOT NULL DEFAULT 'INVITED',
    `respondedAt` DATETIME(3) NULL,

    INDEX `meeting_attendees_userId_idx`(`userId`),
    UNIQUE INDEX `meeting_attendees_meetingId_userId_key`(`meetingId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `meetings` ADD CONSTRAINT `meetings_organizerId_fkey` FOREIGN KEY (`organizerId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meetings` ADD CONSTRAINT `meetings_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meeting_attendees` ADD CONSTRAINT `meeting_attendees_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `meetings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meeting_attendees` ADD CONSTRAINT `meeting_attendees_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

