'use client';

interface StatementProgress {
  status: string;
  processing_stage?: string | null;
  processing_progress?: number | null;
  processing_error?: string | null;
}

const STAGES = [
  { id: 'uploaded', label: 'Uploaded' },
  { id: 'extracting_text', label: 'Reading statement' },
  { id: 'importing_transactions', label: 'Importing transactions' },
  { id: 'categorizing_transactions', label: 'Categorizing' },
  { id: 'completed', label: 'Complete' },
  { id: 'failed', label: 'Failed' },
];

function getProgress(statement: StatementProgress): number {
  if (statement.status === 'completed') return 100;
  if (statement.status === 'failed') return 100;
  return Math.max(0, Math.min(100, Number(statement.processing_progress ?? 0)));
}

export function isStatementProcessing(statement: StatementProgress): boolean {
  return statement.status === 'processing';
}

export default function StatementProcessingProgress({ statement }: { statement: StatementProgress }) {
  const progress = getProgress(statement);
  const stage = statement.processing_stage || statement.status;
  const isFailed = statement.status === 'failed';

  return (
    <div className="space-y-2">
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isFailed ? 'bg-red-500' : 'bg-blue-600'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {STAGES.map((item) => {
          const itemIndex = STAGES.findIndex((candidate) => candidate.id === item.id);
          const currentIndex = STAGES.findIndex((candidate) => candidate.id === stage);
          const isDone =
            item.id !== 'failed' &&
            (statement.status === 'completed' || (currentIndex >= 0 && itemIndex < currentIndex));
          const isCurrent = item.id === stage;

          return (
            <span
              key={item.id}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                isFailed && isCurrent
                  ? 'bg-red-100 text-red-700'
                  : isDone
                    ? 'bg-green-100 text-green-700'
                    : isCurrent
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-500'
              }`}
            >
              {item.label}
            </span>
          );
        })}
      </div>
      {isFailed && statement.processing_error && (
        <p className="text-xs text-red-600">{statement.processing_error}</p>
      )}
    </div>
  );
}
