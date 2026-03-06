
export interface Segment {
  id: string;
  name: string;
  color: string;
  border: string;
  text: string;
  ring: string;
  isCorp: boolean;
}

export interface Script {
  id: string;
  segment: string;
  category: string;
  scenario: string;
  text: string;
  variants?: string[];
  observation?: string; // Nota interna para el agente
}

export interface AppContext {
  agentName: string;
  customerName: string;
  ticketId: string;
}

export interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface UsageRecord {
  id: string;
  timestamp: number;
  agentName: string;
  action: 'copy' | 'formalize' | 'variant';
  segment: string;
  scriptId?: string;
  scenario?: string;
  synced?: boolean;
}

export interface SupervisorConfig {
  accessPin: string;
  isOnlineEnabled: boolean;
}

