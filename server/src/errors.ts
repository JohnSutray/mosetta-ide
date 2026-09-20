import { RpcErrorCode, type RpcErrorBody } from '@mosetta/ide-protocol';

/**
 * An error one is not ashamed to show a person: it carries a code from the protocol,
 * and the router hands it to the client as it is. Everything else that arrives from the
 * code turns into an Internal and goes into the log whole.
 */
export class RpcError extends Error {
  constructor(
    readonly code: RpcErrorCode,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'RpcError';
  }

  toBody(): RpcErrorBody {
    return this.data === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, data: this.data };
  }

  static noWorkspace() {
    return new RpcError(
      RpcErrorCode.NoWorkspace,
      'The session is not attached to a workspace',
    );
  }

  static unknownWorkspace(id: string) {
    return new RpcError(RpcErrorCode.UnknownWorkspace, `Workspace ${id} is not open`);
  }

  static pathEscape(p: string) {
    return new RpcError(
      RpcErrorCode.PathEscape,
      `The path escapes the workspace root: ${p}`,
    );
  }

  static notFound(p: string) {
    return new RpcError(RpcErrorCode.NotFound, `Not found: ${p}`);
  }

  static wrongKind(p: string, expected: 'file' | 'dir') {
    return new RpcError(
      RpcErrorCode.WrongKind,
      expected === 'dir' ? `Not a directory: ${p}` : `Not a file: ${p}`,
    );
  }

  static invalidParams(message: string) {
    return new RpcError(RpcErrorCode.InvalidParams, message);
  }
}
