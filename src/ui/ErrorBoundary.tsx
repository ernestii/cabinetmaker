import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Code, Group, Paper, Text, Title } from '@mantine/core';
import { useStore } from '../state/store';

interface Props {
  /** Shown in the fallback so the user knows what failed (e.g. "3D preview"). */
  label?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/runtime errors in a subtree and shows a recoverable fallback
 * instead of unmounting the whole app to a blank screen. The fallback lets the
 * user export their project (so in-progress work is never lost) and reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface for local debugging; a real monitoring hook (Sentry) plugs in here.
    console.error('ErrorBoundary caught an error:', error, info.componentStack);
  }

  private handleExport = () => {
    try {
      const json = useStore.getState().exportJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cabinetmaker-recovery.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // If even export fails, there's nothing more we can safely do here.
    }
  };

  render() {
    if (this.state.error) {
      const what = this.props.label ? `${this.props.label} ` : '';
      return (
        <Paper withBorder role="alert" maw={560} mx="auto" my={48} p="lg">
          <Title order={3} mb={8}>Something went wrong</Title>
          <Text c="dimmed">The {what}view ran into an unexpected error. Your work is still saved — export it before reloading.</Text>
          <Code block mt="sm" c="danger.4">{this.state.error.message}</Code>
          <Group mt="md" gap="sm">
            <Button onClick={this.handleExport}>Export project</Button>
            <Button variant="default" onClick={() => this.setState({ error: null })}>Try again</Button>
            <Button variant="default" onClick={() => location.reload()}>Reload app</Button>
          </Group>
        </Paper>
      );
    }
    return this.props.children;
  }
}
