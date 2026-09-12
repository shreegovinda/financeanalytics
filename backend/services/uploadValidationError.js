class UploadValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UploadValidationError';
  }
}
module.exports = UploadValidationError;
