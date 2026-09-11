import { RpcErrorCode, type RpcErrorBody } from '@mosetta/ide-protocol';

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
      'Сессия не прикреплена к воркспейсу',
    );
  }

  static unknownWorkspace(id: string) {
    return new RpcError(RpcErrorCode.UnknownWorkspace, `Воркспейс ${id} не открыт`);
  }

  static pathEscape(p: string) {
    return new RpcError(
      RpcErrorCode.PathEscape,
      `Путь выходит за корень воркспейса: ${p}`,
    );
  }

  static notFound(p: string) {
    return new RpcError(RpcErrorCode.NotFound, `Не найдено: ${p}`);
  }

  static wrongKind(p: string, expected: 'file' | 'dir') {
    return new RpcError(
      RpcErrorCode.WrongKind,
      expected === 'dir' ? `Не директория: ${p}` : `Не файл: ${p}`,
    );
  }

  static invalidParams(message: string) {
    return new RpcError(RpcErrorCode.InvalidParams, message);
  }
}
