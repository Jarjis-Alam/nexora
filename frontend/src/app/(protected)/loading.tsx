export default function ProtectedLoading() {
  return (
    <div className="py-20 flex flex-col items-center justify-center space-y-4 text-center">
      <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      <div className="font-mono text-label-xs text-text-muted uppercase tracking-wider">
        CALIBRATING PLACEMENT METRICS...
      </div>
    </div>
  );
}
