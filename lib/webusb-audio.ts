import { logger } from '@/lib/logger';

export interface WebUSBStatus {
  isActive: boolean;
  deviceName: string | null;
  error: string | null;
}

export class WebUSBBridge {
  private device: any = null;
  private endpointOut: number = 0;
  public isActive = false;
  private onStatusChange?: (status: WebUSBStatus) => void;
  private packetSize = 1024; // Stream protocol definition

  constructor() {
    if (typeof navigator !== 'undefined' && (navigator as any).usb) {
      (navigator as any).usb.addEventListener('connect', this.handleConnect);
      (navigator as any).usb.addEventListener('disconnect', this.handleDisconnect);
    }
  }

  public setStatusListener(listener: (status: WebUSBStatus) => void) {
    this.onStatusChange = listener;
  }

  private updateStatus(error: string | null = null) {
    if (this.onStatusChange) {
      this.onStatusChange({
        isActive: this.isActive,
        deviceName: this.device?.productName ?? null,
        error
      });
    }
  }

  private handleConnect = async (event: any) => {
    logger.info('USB Device connected', event.device.productName);
    if (!this.isActive) {
      this.device = event.device;
      await this.establishConnection();
    }
  };

  private handleDisconnect = (event: any) => {
    if (this.device && event.device === this.device) {
      logger.warn('USB Device disconnected');
      this.disconnect();
      this.updateStatus('Device disconnected');
    }
  };

  async enumerateDevices() {
    if (typeof navigator === 'undefined' || !(navigator as any).usb) return [];
    try {
      const devices = await (navigator as any).usb.getDevices();
      return devices;
    } catch (e) {
      logger.error('Failed to enumerate devices', e);
      return [];
    }
  }

  async requestDevice(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !(navigator as any).usb) {
      logger.warn("WebUSB is not supported in this browser.");
      this.updateStatus("WebUSB not supported");
      return false;
    }

    try {
      // Security Review: Enforce user gesture limits here (must be triggered by UI)
      this.device = await (navigator as any).usb.requestDevice({ filters: [] });
      return await this.establishConnection();
    } catch (e: any) {
      logger.warn("WebUSB connection failed (graceful degradation):", e.message ?? e);
      this.isActive = false;
      this.updateStatus(e.message ?? "Connection failed");
      return false;
    }
  }

  private async establishConnection(): Promise<boolean> {
    try {
      await this.device.open();
      
      // Security Audit: Check if device configuration needs selection
      if (this.device.configuration === null) {
        await this.device.selectConfiguration(1);
      }
      
      let asInterfaceNumber = -1;
      
      // Device discovery & stream protocol selection
      for (const config of this.device.configurations) {
        for (const iface of config.interfaces) {
          for (const alt of iface.alternates) {
            // Audio Streaming (1, 2) or Vendor Specific (255)
            if ((alt.interfaceClass === 1 && alt.interfaceSubclass === 2) || alt.interfaceClass === 255) { 
              asInterfaceNumber = iface.interfaceNumber;
              for (const ep of alt.endpoints) {
                if (ep.direction === 'out') {
                  this.endpointOut = ep.endpointNumber;
                  this.packetSize = ep.packetSize || 1024;
                  break;
                }
              }
              if (this.endpointOut > 0) break;
            }
          }
          if (this.endpointOut > 0) break;
        }
        if (this.endpointOut > 0) break;
      }

      if (asInterfaceNumber === -1 || this.endpointOut === 0) {
        throw new Error("Could not find Audio Streaming interface with OUT endpoint.");
      }

      await this.device.claimInterface(asInterfaceNumber);
      this.isActive = true;
      this.updateStatus();
      return true;
    } catch (e: any) {
      logger.error("Failed to establish USB connection", e);
      this.isActive = false;
      this.updateStatus(`Connection error: ${e.message}`);
      return false;
    }
  }

  // Stream Protocol Definition
  async sendAudioBuffer(int16Buffer: ArrayBuffer) {
    if (!this.isActive || !this.device || this.endpointOut === 0) return;
    
    try {
      // Stream protocol implementation with chunking
      let offset = 0;
      while (offset < int16Buffer.byteLength) {
        const chunk = int16Buffer.slice(offset, offset + this.packetSize);
        await this.device.transferOut(this.endpointOut, chunk);
        offset += this.packetSize;
      }
    } catch (e) {
      logger.warn("Buffer transfer error, initiating recovery", e);
      // Error recovery
      this.isActive = false;
      this.updateStatus("Buffer transfer error");
    }
  }

  async disconnect() {
    this.isActive = false;
    if (this.device) {
      try {
         await this.device.close();
      } catch (e) {
         logger.warn('Error closing device', e);
      }
    }
    this.device = null;
    this.endpointOut = 0;
    this.updateStatus('Disconnected');
  }
}

export const webUSB = new WebUSBBridge();
