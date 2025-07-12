import { Context, Data, Effect, pipe } from 'effect';
import { BunRuntime } from '@effect/platform-bun';
import * as net from 'net';
import { CommandParser, BufferedCommandParser, Endianness } from './parser';

export class ServerInfo extends Context.Tag('ServerInfo')<
  ServerInfo,
  {
    port: number;
    host: string;
    isEcho?: boolean;
    endianness?: Endianness;
  }
>() {}

const program = Effect.fn('program')(function* () {
  const serverInfo = yield* ServerInfo;
  console.log('Hello there! The server is up.');
  const server = net.createServer((socket) =>
    pipe(
      Effect.gen(function* () {
        const randomIdentifier = Math.random().toString(36).substring(2, 15);
        console.log(`[${randomIdentifier}] New connection`);
        let whoAmI: 1 | 2 | undefined = undefined;
        const commandParser = new BufferedCommandParser(
          serverInfo.endianness ?? Endianness.Little,
        );

        socket.on('data', (data) => {
          // Convert data to Uint8Array and add to buffer
          const intArray = Uint8Array.from(data);
          console.log(
            `[${randomIdentifier}] Received ${intArray.length} bytes, buffer size: ${commandParser.getBufferSize()}`,
          );

          // Parse all complete commands from the buffer
          const parsedCommands = commandParser.addData(intArray);

          // Process each parsed command
          for (const command of parsedCommands) {
            console.log(`[${randomIdentifier}] Parsed command:`, command.type);

            if (command.type === 'identity') {
              const identityData = command.data as {
                vers: 1 | 2;
                shouldEcho: boolean;
              };
              whoAmI = identityData.vers;
              console.log(
                `[${randomIdentifier}] Verified who I am: ${whoAmI === 1 ? 'robot' : 'whiteboard/controller'}`,
              );
              if (identityData.shouldEcho) {
                // Echo back the original command
                const echoData = CommandParser.encode(
                  'echo',
                  {
                    array: Array.from(intArray),
                  },
                  serverInfo.endianness ?? Endianness.Little,
                );
                socket.write(echoData);
              }
            } else if (serverInfo.isEcho) {
              // Echo back the original command
              const echoData = CommandParser.encode(
                'echo',
                {
                  array: Array.from(intArray),
                },
                serverInfo.endianness ?? Endianness.Little,
              );
              socket.write(echoData);
            } else {
              // Handle other command types
              switch (command.type) {
                case 'move':
                  const moveData = command.data as {
                    xPosition: number;
                    yPosition: number;
                  };
                  console.log(
                    `[${randomIdentifier}] Move command: x=${moveData.xPosition}, y=${moveData.yPosition}`,
                  );
                  // TODO: Implement move logic
                  break;
                case 'echo':
                  const echoData = command.data as { array: number[] };
                  console.log(
                    `[${randomIdentifier}] Echo command with ${echoData.array.length} bytes`,
                  );
                  // TODO: Implement echo handling
                  break;
                case 'setConfig':
                  const configData = command.data as { isEcho?: boolean };
                  console.log(
                    `[${randomIdentifier}] SetConfig command: isEcho=${configData.isEcho}`,
                  );
                  // TODO: Implement config setting
                  break;
              }
            }
          }

          // Log partial command preview for debugging
          const preview = commandParser.previewPartialCommand();
          if (preview.possibleCommand && preview.missingBytes) {
            console.log(
              `[${randomIdentifier}] Partial command detected: ${preview.possibleCommand}, missing ${preview.missingBytes} bytes (confidence: ${preview.confidence})`,
            );
          }
        });

        socket.on('close', () => {
          console.log(`[${randomIdentifier}] Connection closed`);
          commandParser.clearBuffer();
        });

        socket.on('error', (error) => {
          console.error(`[${randomIdentifier}] Socket error:`, error);
          commandParser.clearBuffer();
        });

        // wait for 2 seconds and if no identity command was received, close the connection
        yield* Effect.sleep(2000);
        if (whoAmI === undefined) {
          console.log(
            `[${randomIdentifier}] No identity command received, closing connection`,
          );
          socket.end();
        }
      }),
      Effect.runFork,
    ),
  );

  server.listen(serverInfo.port, serverInfo.host, () => {
    console.log(`Server is running on ${serverInfo.host}:${serverInfo.port}`);
  });

  server.on('error', (error) => {
    console.error('Server error:', error);
  });

  return yield* Effect.succeed(server);
});

export default program;
