function createLogger(): any {
  return {
    fatal: jest.fn(() => {}),
    error: jest.fn(() => {}),
    warn: jest.fn(() => {}),
    info: jest.fn(() => {}),
    debug: jest.fn(() => {}),
    trace: jest.fn(() => {}),
    child: jest.fn(createLogger),
  }
}

export default {
  createLogger: jest.fn(createLogger),
}
