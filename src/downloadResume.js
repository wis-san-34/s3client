const { clampPartSize } = require("./transferShared");

function buildCompletedDownloadParts({
  total = 0,
  partSize,
  existingSize = 0,
  resumeInfo,
  etag,
}) {
  const normalizedPartSize = clampPartSize(partSize);
  const completedParts = new Map();
  const resumeParts =
    resumeInfo && resumeInfo.etag && resumeInfo.etag !== etag ? [] : resumeInfo?.parts || [];

  resumeParts.forEach((part) => {
    if (part?.PartNumber && part.size) {
      completedParts.set(part.PartNumber, part);
    }
  });

  let derivedExistingSize = existingSize;
  if (derivedExistingSize > total) {
    derivedExistingSize = 0;
  }

  if (completedParts.size === 0 && derivedExistingSize > 0) {
    const completed = Math.floor(derivedExistingSize / normalizedPartSize);
    for (let partNumber = 1; partNumber <= completed; partNumber++) {
      const start = (partNumber - 1) * normalizedPartSize;
      const end = Math.min(total - 1, partNumber * normalizedPartSize - 1);
      completedParts.set(partNumber, {
        PartNumber: partNumber,
        size: end - start + 1,
      });
    }
  }

  return {
    normalizedPartSize,
    completedParts,
    loaded: Array.from(completedParts.values()).reduce((acc, part) => acc + (part.size || 0), 0),
  };
}

module.exports = {
  buildCompletedDownloadParts,
};
