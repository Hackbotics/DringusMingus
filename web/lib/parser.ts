// 1 is going to be the the a positioning command
// 2 is going to be an echo-type
// 3 is going to be an identity command
// 4 is going to be a set-config command
// 5 is going to be a position-update command
// 6 is going to be a get command

export enum Endianness {
  Little = 'little',
  Big = 'big',
}

function match(command: number): CommandTypes | undefined {
  switch (command) {
    case 1:
      return 'move' as const;
    case 2:
      return 'echo' as const;
    case 3:
      return 'identity' as const;
    case 4:
      return 'setConfig' as const;
    case 5:
      return 'position-update' as const;
    case 6:
      return 'get' as const;
    case 7:
      return 'request' as const;
  }
}

type CommandTypes =
  | 'move'
  | 'echo'
  | 'identity'
  | 'setConfig'
  | 'position-update'
  | 'get'
  | 'request';

type CommandDatas = {
  move: {
    xPosition: number; // 16-bit value
    yPosition: number; // 16-bit value
  };
  echo: {
    array: number[];
  };
  identity: {
    // 1 is going to be robot, 2 is going to be whiteboard/controller
    vers: 1 | 2;
    shouldEcho: boolean;
  };
  setConfig: {
    isEcho?: boolean;
  };
  'position-update': {
    xPosition: number;
    yPosition: number;
  };
  get: {
    xPosition: number;
    yPosition: number;
  };
  request: {
    xPosition: number;
    yPosition: number;
  };
};

// Utility functions for endianness handling
class EndianUtils {
  static readUint16(
    buffer: Uint8Array,
    offset: number,
    endianness: Endianness,
  ): number {
    if (offset + 1 >= buffer.length) {
      throw new Error('Buffer too small for uint16 read');
    }
    if (endianness === Endianness.Little) {
      return buffer[offset]! | (buffer[offset + 1]! << 8);
    } else {
      return (buffer[offset]! << 8) | buffer[offset + 1]!;
    }
  }

  static readUint32(
    buffer: Uint8Array,
    offset: number,
    endianness: Endianness,
  ): number {
    if (offset + 3 >= buffer.length) {
      throw new Error('Buffer too small for uint32 read');
    }
    if (endianness === Endianness.Little) {
      return (
        buffer[offset]! |
        (buffer[offset + 1]! << 8) |
        (buffer[offset + 2]! << 16) |
        (buffer[offset + 3]! << 24)
      );
    } else {
      return (
        (buffer[offset]! << 24) |
        (buffer[offset + 1]! << 16) |
        (buffer[offset + 2]! << 8) |
        buffer[offset + 3]!
      );
    }
  }

  static writeUint16(
    buffer: Uint8Array,
    offset: number,
    value: number,
    endianness: Endianness,
  ): void {
    if (offset + 1 >= buffer.length) {
      throw new Error('Buffer too small for uint16 write');
    }
    if (endianness === Endianness.Little) {
      buffer[offset] = value & 0xff;
      buffer[offset + 1] = (value >> 8) & 0xff;
    } else {
      buffer[offset] = (value >> 8) & 0xff;
      buffer[offset + 1] = value & 0xff;
    }
  }

  static writeUint32(
    buffer: Uint8Array,
    offset: number,
    value: number,
    endianness: Endianness,
  ): void {
    if (offset + 3 >= buffer.length) {
      throw new Error('Buffer too small for uint32 write');
    }
    if (endianness === Endianness.Little) {
      buffer[offset] = value & 0xff;
      buffer[offset + 1] = (value >> 8) & 0xff;
      buffer[offset + 2] = (value >> 16) & 0xff;
      buffer[offset + 3] = (value >> 24) & 0xff;
    } else {
      buffer[offset] = (value >> 24) & 0xff;
      buffer[offset + 1] = (value >> 16) & 0xff;
      buffer[offset + 2] = (value >> 8) & 0xff;
      buffer[offset + 3] = value & 0xff;
    }
  }
}

export class CommandParser {
  private static defaultEndianness: Endianness = Endianness.Little;

  static setDefaultEndianness(endianness: Endianness): void {
    this.defaultEndianness = endianness;
  }

  static getDefaultEndianness(): Endianness {
    return this.defaultEndianness;
  }

  static isMoveCommandType(commandType: unknown): commandType is 'move' {
    return commandType === 'move';
  }

  static isEchoCommandType(commandType: unknown): commandType is 'echo' {
    return commandType === 'echo';
  }

  static isIdentityCommandType(
    commandType: unknown,
  ): commandType is 'identity' {
    return commandType === 'identity';
  }

  static isSetConfigCommandType(
    commandType: unknown,
  ): commandType is 'setConfig' {
    return commandType === 'setConfig';
  }

  static isPositionUpdateCommandType(
    commandType: unknown,
  ): commandType is 'position-update' {
    return commandType === 'position-update';
  }

  static isGetCommandType(commandType: unknown): commandType is 'get' {
    return commandType === 'get';
  }

  static isRequestCommandType(commandType: unknown): commandType is 'request' {
    return commandType === 'request';
  }

  static parse(commands: Uint8Array, endianness?: Endianness) {
    const usedEndianness = endianness ?? this.defaultEndianness;
    const command = commands[0]!;
    const commandType = match(command);
    if (this.isMoveCommandType(commandType)) {
      // Move command now uses 16-bit values for positions
      const xPosition = EndianUtils.readUint16(commands, 1, usedEndianness);
      const yPosition = EndianUtils.readUint16(commands, 3, usedEndianness);
      return {
        type: commandType,
        data: {
          xPosition,
          yPosition,
        },
      };
    }
    if (this.isEchoCommandType(commandType)) {
      const array = commands.slice(1);
      console.log('array', array);
      // turn the array into a number array
      const numberArray = Array.from(array, (x) => x as number);
      return {
        type: commandType,
        data: { array: numberArray },
      };
    }
    if (this.isIdentityCommandType(commandType)) {
      const vers = commands[1]!;
      const shouldEcho = commands[2] === 1 ? true : false;
      return {
        type: commandType,
        data: { vers: vers as 1 | 2, shouldEcho },
      };
    }
    if (this.isSetConfigCommandType(commandType)) {
      return {
        type: commandType,
        data: { isEcho: commands[1] === 1 ? true : false },
      };
    }
    if (this.isPositionUpdateCommandType(commandType)) {
      const xPosition = EndianUtils.readUint16(commands, 1, usedEndianness);
      const yPosition = EndianUtils.readUint16(commands, 3, usedEndianness);
      return {
        type: commandType,
        data: { xPosition, yPosition },
      };
    }
    if (this.isGetCommandType(commandType)) {
      const xPosition = EndianUtils.readUint16(commands, 1, usedEndianness);
      const yPosition = EndianUtils.readUint16(commands, 3, usedEndianness);
      return {
        type: commandType,
        data: { xPosition, yPosition },
      };
    }
    if (this.isRequestCommandType(commandType)) {
      const xPosition = EndianUtils.readUint16(commands, 1, usedEndianness);
      const yPosition = EndianUtils.readUint16(commands, 3, usedEndianness);
      return {
        type: commandType,
        data: { xPosition, yPosition },
      };
    }
    throw new Error(`Unknown command: ${command}`);
  }

  static encode(
    command: CommandTypes,
    data: CommandDatas[CommandTypes],
    endianness?: Endianness,
  ) {
    const usedEndianness = endianness ?? this.defaultEndianness;
    if (this.isMoveCommandType(command)) {
      const { xPosition, yPosition } = data as CommandDatas['move'];
      // Move command now uses 16-bit values for positions (1 byte command + 2 bytes x + 2 bytes y = 5 bytes)
      const commandBuffer = new Uint8Array(5);
      commandBuffer[0] = 1;
      EndianUtils.writeUint16(commandBuffer, 1, xPosition, usedEndianness);
      EndianUtils.writeUint16(commandBuffer, 3, yPosition, usedEndianness);
      return commandBuffer;
    }
    if (this.isEchoCommandType(command)) {
      const { array } = data as CommandDatas['echo'];
      const commandBuffer = new Uint8Array(array.length + 1);
      commandBuffer[0] = 2;
      commandBuffer.set(array, 1);
      return commandBuffer;
    }
    if (this.isIdentityCommandType(command)) {
      const { vers, shouldEcho } = data as CommandDatas['identity'];
      const commandBuffer = new Uint8Array(3);
      commandBuffer[0] = 3;
      commandBuffer[1] = vers;
      commandBuffer[2] = shouldEcho ? 1 : 0;
      return commandBuffer;
    }
    if (this.isSetConfigCommandType(command)) {
      const { isEcho } = data as CommandDatas['setConfig'];
      const commandBuffer = new Uint8Array(2);
      commandBuffer[0] = 4;
      commandBuffer[1] = isEcho ? 1 : 0;
      return commandBuffer;
    }
    if (this.isPositionUpdateCommandType(command)) {
      const { xPosition, yPosition } = data as CommandDatas['position-update'];
      const commandBuffer = new Uint8Array(5);
      commandBuffer[0] = 5;
      EndianUtils.writeUint16(commandBuffer, 1, xPosition, usedEndianness);
      EndianUtils.writeUint16(commandBuffer, 3, yPosition, usedEndianness);
      return commandBuffer;
    }
    if (this.isGetCommandType(command)) {
      const { xPosition, yPosition } = data as CommandDatas['get'];
      const commandBuffer = new Uint8Array(5);
      commandBuffer[0] = 6;
      EndianUtils.writeUint16(commandBuffer, 1, xPosition, usedEndianness);
      EndianUtils.writeUint16(commandBuffer, 3, yPosition, usedEndianness);
      return commandBuffer;
    }
    if (this.isRequestCommandType(command)) {
      const { xPosition, yPosition } = data as CommandDatas['request'];
      const commandBuffer = new Uint8Array(5);
      commandBuffer[0] = 7;
      EndianUtils.writeUint16(commandBuffer, 1, xPosition, usedEndianness);
      EndianUtils.writeUint16(commandBuffer, 3, yPosition, usedEndianness);
      return commandBuffer;
    }
    throw new Error(`Unknown command: ${command}`);
  }
}

export class BufferedCommandParser {
  private buffer: Uint8Array = new Uint8Array(0);
  private endianness: Endianness;

  constructor(endianness: Endianness = Endianness.Little) {
    this.endianness = endianness;
  }

  setEndianness(endianness: Endianness): void {
    this.endianness = endianness;
  }

  getEndianness(): Endianness {
    return this.endianness;
  }

  getBufferSize(): number {
    return this.buffer.length;
  }

  clearBuffer(): void {
    this.buffer = new Uint8Array(0);
  }

  addData(
    data: Uint8Array,
  ): Array<{ type: CommandTypes; data: CommandDatas[CommandTypes] }> {
    // Append new data to buffer
    const newBuffer = new Uint8Array(this.buffer.length + data.length);
    newBuffer.set(this.buffer);
    newBuffer.set(data, this.buffer.length);
    this.buffer = newBuffer;

    const parsedCommands: Array<{
      type: CommandTypes;
      data: CommandDatas[CommandTypes];
    }> = [];

    // Try to parse complete commands from buffer
    let offset = 0;
    while (offset < this.buffer.length) {
      const remainingBuffer = this.buffer.slice(offset);
      const commandLength = this.getCommandLength(remainingBuffer);

      if (commandLength === -1) {
        // Unknown command, skip this byte
        offset++;
        continue;
      }

      if (remainingBuffer.length < commandLength) {
        // Not enough data for complete command
        break;
      }

      try {
        const commandData = remainingBuffer.slice(0, commandLength);
        const parsed = CommandParser.parse(commandData, this.endianness);
        parsedCommands.push(parsed);
        offset += commandLength;
      } catch (error) {
        // Failed to parse, skip this byte
        offset++;
      }
    }

    // Keep remaining unparsed data in buffer
    if (offset > 0) {
      this.buffer = this.buffer.slice(offset);
    }

    return parsedCommands;
  }

  private getCommandLength(buffer: Uint8Array): number {
    if (buffer.length === 0) return -1;

    const command = buffer[0]!;
    switch (command) {
      case 1: // move command - 1 byte command + 2 bytes x + 2 bytes y = 5 bytes
        return 5;
      case 2: // echo command - variable length, need to determine from data
        // For now, assume echo commands are the remaining buffer
        // In a real implementation, you might need a length prefix
        return buffer.length;
      case 3: // identity command - 1 byte command + 1 byte vers + 1 byte shouldEcho = 3 bytes
        return 3;
      case 4: // setConfig command - 1 byte command + 1 byte isEcho = 2 bytes
        return 2;
      case 5: // position-update command - 1 byte command + 2 bytes x + 2 bytes y = 5 bytes
        return 5;
      case 6: // get command - 1 byte command + 2 bytes x + 2 bytes y = 5 bytes
        return 5;
      case 7: // request command - 1 byte command + 2 bytes x + 2 bytes y = 5 bytes
        return 5;
      default:
        return -1; // Unknown command
    }
  }

  previewPartialCommand(): {
    possibleCommand: string | null;
    missingBytes: number;
    confidence: number;
  } {
    if (this.buffer.length === 0) {
      return { possibleCommand: null, missingBytes: 0, confidence: 0 };
    }

    const command = this.buffer[0]!;
    const commandType = match(command);
    if (!commandType) {
      return { possibleCommand: null, missingBytes: 0, confidence: 0 };
    }

    const expectedLength = this.getCommandLength(this.buffer);
    if (expectedLength === -1) {
      return { possibleCommand: null, missingBytes: 0, confidence: 0 };
    }

    const missingBytes = Math.max(0, expectedLength - this.buffer.length);
    const confidence = Math.min(1, this.buffer.length / expectedLength);

    return {
      possibleCommand: commandType,
      missingBytes,
      confidence,
    };
  }
}
