import {
  getMaxAttachmentFileSizeBytes,
  getMaxAttachmentTotalSizeBytes,
  getMaxEmbeddedImageSizeBytes,
} from "#/utils/attachment-size-limit";

export interface FileValidationResult {
  isValid: boolean;
  errorMessage?: string;
  oversizedFiles?: string[];
}

/**
 * Render a byte ceiling as the limit label used in error messages ("200MB").
 *
 * Fractional limits are rounded to a whole megabyte so the label stays a
 * round number the user can reason about.
 */
function formatLimitMb(limitBytes: number): string {
  return `${Math.round(limitBytes / (1024 * 1024))}MB`;
}

/**
 * Validates individual file sizes
 */
export function validateIndividualFileSizes(
  files: File[],
): FileValidationResult {
  const maxSize = getMaxAttachmentFileSizeBytes();
  const oversizedFiles = files.filter((file) => file.size > maxSize);

  if (oversizedFiles.length > 0) {
    const fileNames = oversizedFiles.map((f) => f.name);
    return {
      isValid: false,
      errorMessage: `Files exceeding ${formatLimitMb(maxSize)} are not allowed: ${fileNames.join(", ")}`,
      oversizedFiles: fileNames,
    };
  }

  return { isValid: true };
}

/**
 * Validates total file size including existing files
 */
export function validateTotalFileSize(
  newFiles: File[],
  existingFiles: File[] = [],
): FileValidationResult {
  const maxSize = getMaxAttachmentTotalSizeBytes();
  const currentTotalSize = existingFiles.reduce(
    (sum, file) => sum + file.size,
    0,
  );
  const newFilesSize = newFiles.reduce((sum, file) => sum + file.size, 0);
  const totalSize = currentTotalSize + newFilesSize;

  if (totalSize > maxSize) {
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(1);
    return {
      isValid: false,
      errorMessage: `Total file size would be ${totalSizeMB}MB, exceeding the ${formatLimitMb(maxSize)} limit. Please select fewer or smaller files.`,
    };
  }

  return { isValid: true };
}

/**
 * Validates both individual and total file sizes
 */
export function validateFiles(
  newFiles: File[],
  existingFiles: File[] = [],
): FileValidationResult {
  // First check individual file sizes
  const individualValidation = validateIndividualFileSizes(newFiles);
  if (!individualValidation.isValid) {
    return individualValidation;
  }

  // Then check total size
  return validateTotalFileSize(newFiles, existingFiles);
}

/**
 * Validates the images that will be embedded in the message rather than
 * uploaded as workspace files.
 *
 * Embedded images are base64-encoded and sent as a WebSocket frame, which the
 * SDK caps at 4 MiB. This ceiling is fixed and deliberately not affected by
 * the configurable upload limit, which only governs the HTTP upload path.
 */
export function validateEmbeddedImageSizes(
  images: File[],
): FileValidationResult {
  const maxSize = getMaxEmbeddedImageSizeBytes();
  const oversizedImages = images.filter((image) => image.size > maxSize);

  if (oversizedImages.length > 0) {
    const imageNames = oversizedImages.map((image) => image.name);
    return {
      isValid: false,
      errorMessage: `Images exceeding ${formatLimitMb(maxSize)} are not allowed: ${imageNames.join(", ")}. Upload them as files instead.`,
      oversizedFiles: imageNames,
    };
  }

  return { isValid: true };
}
