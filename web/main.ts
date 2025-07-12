import { Effect, pipe } from 'effect';
import robotLayer, { ServerInfo } from './lib/robot_layer';
import { BunRuntime } from '@effect/platform-bun';
import { Endianness } from './lib/parser';

BunRuntime.runMain(
  pipe(
    robotLayer(),
    Effect.provideService(
      ServerInfo,
      ServerInfo.of({
        port: 8080,
        host: '127.0.0.1',
        isEcho: false,
        endianness: Endianness.Little,
      }),
    ),
  ),
);
