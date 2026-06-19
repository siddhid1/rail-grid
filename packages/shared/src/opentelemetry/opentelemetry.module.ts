import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';

export const OTEL_SDK = Symbol('OTEL_SDK');

export class OpenTelemetryShutdown implements OnApplicationShutdown {
  constructor(@Inject(OTEL_SDK) private readonly sdk: NodeSDK) {}

  async onApplicationShutdown(): Promise<void> {
    await this.sdk.shutdown();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: OTEL_SDK,
      inject: [ConfigService],
      useFactory: (config: ConfigService): NodeSDK => {
        const endpoint = config.get<string>('OTEL_EXPORTER_OTLP_ENDPOINT') ?? 'http://localhost:4318';
        const sdk = new NodeSDK({
          serviceName: config.get<string>('SERVICE_NAME') ?? 'irctc-service',
          traceExporter: new OTLPTraceExporter({ url: endpoint + '/v1/traces' }),
          metricReader: new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({ url: endpoint + '/v1/metrics' }),
            exportIntervalMillis: 60000,
          }),
          instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
        });
        sdk.start();
        return sdk;
      },
    },
    OpenTelemetryShutdown,
  ],
  exports: [OTEL_SDK],
})
export class OpenTelemetryModule {}
