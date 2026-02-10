/**
 * YAML helper — wraps the `yaml` package for config parsing.
 */

import YAML from 'yaml';

export function parse(input: string): unknown {
  return YAML.parse(input);
}

export function stringify(data: unknown): string {
  return YAML.stringify(data);
}
