import { DeviceStream } from "../../../components/DeviceStream";
import { listDevices } from "../../../lib/api";

export const dynamicParams = false;

export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  try {
    const devices = await listDevices();
    if (devices.length > 0) {
      return devices.map((device) => ({ id: device.id }));
    }
  } catch {
    // Fall back to a placeholder device shell when the worker is unavailable at build time.
  }

  return [{ id: "preview-device" }];
}

export default async function DevicePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="page-stack">
      <DeviceStream deviceId={id} />
    </main>
  );
}
