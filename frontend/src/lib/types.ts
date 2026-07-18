export interface ChallengeConfig {
  id: number;
  name: string;
  description?: string;
  docker_image_name: string;
  internal_ports: number[];
  ram_limit: string;
  cpu_limit: number;
}

export interface GlobalSettings {
  id: number;
  default_ttl_minutes: number;
  port_range_start: number;
  port_range_end: number;
}

export interface DockerImage {
  id: string;
  tags: string[];
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string[];
  status: string;
  labels: Record<string, string>;
  ports: Record<string, { HostIp: string; HostPort: string }[] | null>;
  expires_at?: number | null;
  time_remaining_seconds?: number | null;
}

export interface DockerStatsSummary {
  total_cpu_percent: number;
  total_memory_usage: number;
  total_memory_limit: number;
}
