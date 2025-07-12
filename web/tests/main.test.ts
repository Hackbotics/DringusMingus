import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import robotLayer, { ServerInfo } from '../lib/robot_layer';
import { Effect, pipe } from 'effect';
import * as net from 'net';
import { CommandParser, Endianness } from '../lib/parser';

// Helper function to connect to the TCP server
async function connectToServer(
  host: string = '127.0.0.1',
  port: number = 8080,
): Promise<net.Socket> {
  const client = net.createConnection({ port, host });

  await new Promise((resolve) => {
    client.on('connect', () => {
      resolve(true);
    });
  });

  return client;
}

async function addIdentityCommand(
  client: net.Socket,
  vers: 1 | 2,
  shouldEcho: boolean = false,
) {
  const command = CommandParser.encode('identity', {
    vers,
    shouldEcho,
  });
  client.write(command);
}

// Helper function to read echo commands from the server
async function readEchoCommand(client: net.Socket): Promise<any> {
  return new Promise((resolve) => {
    client.on('data', (data) => {
      const parsed = CommandParser.parse(data);
      if (parsed.type === 'echo') {
        resolve(parsed);
      }
    });
  });
}

// create a test that will test the server info context

describe('Server Connection', () => {
  let server: net.Server;

  beforeAll(() => {
    // starts the server once for all tests
    server = pipe(
      robotLayer(),
      Effect.provideService(
        ServerInfo,
        ServerInfo.of({
          port: 8080,
          host: '127.0.0.1',
          isEcho: true,
        }),
      ),
      Effect.runSync,
    );
  });

  afterAll(async () => {
    // do something to stop the server
    await new Promise((resolve) => {
      server.close(resolve);
    });
    console.log('server closed');
  });

  test('test to see if we can connect to the server', async () => {
    const client = await connectToServer();
    expect(true).toBe(true);
    client.end();
  }, 1000); // 1s timeout

  test('test to see if we can send an identity command to the server', async () => {
    const client = await connectToServer();
    await addIdentityCommand(client, 1, true);
    const data = await readEchoCommand(client);
    expect(data).toEqual({
      type: 'echo',
      data: {
        array: [3, 1, 1],
      },
    });
    client.end();
  });

  test('test to see if we can send a movement command to the server', async () => {
    const client = await connectToServer();
    await addIdentityCommand(client, 2);
    // Add a small delay to ensure identity command is processed first
    await new Promise((resolve) => setTimeout(resolve, 100));
    const command = CommandParser.encode('move', {
      xPosition: 1,
      yPosition: 2,
    });
    client.write(command);
    const data = await readEchoCommand(client);
    expect(data).toEqual({
      type: 'echo',
      data: {
        array: [1, 1, 0, 2, 0], // Move command now uses 16-bit values: command(1) + xPos(1,0) + yPos(2,0) in little endian
      },
    });
    client.end();
  }, 2000);

  test('test to see if we can run two connections at the same time and both receive correct echo responses', async () => {
    // Connect both clients using the helper function
    const [client1, client2] = await Promise.all([
      connectToServer(),
      connectToServer(),
    ]);
    await Promise.all([
      addIdentityCommand(client1, 1),
      addIdentityCommand(client2, 2),
    ]);
    console.log('clients connected');

    // Add a small delay to ensure identity commands are processed first
    await new Promise((resolve) => setTimeout(resolve, 100));

    const command1 = CommandParser.encode('move', {
      xPosition: 1,
      yPosition: 2,
    });
    const command2 = CommandParser.encode('move', {
      xPosition: 3,
      yPosition: 4,
    });
    console.log('commands written');

    client1.write(command1);
    client2.write(command2);

    // Wait for both clients to receive their echo responses and parse them
    const [data1, data2] = await Promise.all([
      readEchoCommand(client1),
      readEchoCommand(client2),
    ]);

    client1.end();
    client2.end();

    expect(data1).toEqual({
      type: 'echo',
      data: {
        array: [1, 1, 0, 2, 0], // Move command now uses 16-bit values: command(1) + xPos(1,0) + yPos(2,0) in little endian
      },
    });
    expect(data2).toEqual({
      type: 'echo',
      data: {
        array: [1, 3, 0, 4, 0], // Move command now uses 16-bit values: command(1) + xPos(3,0) + yPos(4,0) in little endian
      },
    });
    expect(data1).not.toEqual(data2);
  });
});

describe('Endianness Support', () => {
  test('should encode and decode move commands with little endian', () => {
    const moveData = { xPosition: 0x1234, yPosition: 0x5678 };

    // Encode with little endian
    const encoded = CommandParser.encode('move', moveData, Endianness.Little);

    // Should be: [1, 0x34, 0x12, 0x78, 0x56] (little endian)
    expect(Array.from(encoded)).toEqual([1, 0x34, 0x12, 0x78, 0x56]);

    // Decode with little endian
    const decoded = CommandParser.parse(encoded, Endianness.Little);
    expect(decoded).toEqual({
      type: 'move',
      data: moveData,
    });
  });

  test('should encode and decode move commands with big endian', () => {
    const moveData = { xPosition: 0x1234, yPosition: 0x5678 };

    // Encode with big endian
    const encoded = CommandParser.encode('move', moveData, Endianness.Big);

    // Should be: [1, 0x12, 0x34, 0x56, 0x78] (big endian)
    expect(Array.from(encoded)).toEqual([1, 0x12, 0x34, 0x56, 0x78]);

    // Decode with big endian
    const decoded = CommandParser.parse(encoded, Endianness.Big);
    expect(decoded).toEqual({
      type: 'move',
      data: moveData,
    });
  });

  test('should handle mixed endianness correctly', () => {
    const moveData = { xPosition: 0x1234, yPosition: 0x5678 };

    // Encode with little endian, try to decode with big endian (should give different result)
    const encodedLittle = CommandParser.encode(
      'move',
      moveData,
      Endianness.Little,
    );
    const decodedAsBig = CommandParser.parse(encodedLittle, Endianness.Big);

    // Values should be byte-swapped
    expect(decodedAsBig.data).toEqual({
      xPosition: 0x3412, // byte-swapped from 0x1234
      yPosition: 0x7856, // byte-swapped from 0x5678
    });
  });
});
