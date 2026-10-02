import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';

function stageFrom(error?: string) {
  const m = error?.match(/\[STAGE:([A-Z_]+)\]/);
  return m?.[1] || null;
}

class JtsReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    const error = result.error?.message || result.errors?.map(e => e.message).filter(Boolean).join('\n') || '';
    const attachments = Object.fromEntries(
      result.attachments.filter(a => a.path).map(a => [a.name, a.path])
    );
    const payload = {
      title: test.title,
      project: test.parent.project()?.name || 'unknown',
      status: result.status === 'passed' ? 'pass' : 'fail',
      duration_ms: result.duration,
      failure_stage: stageFrom(error),
      error: error.replace(/\[STAGE:[A-Z_]+\]\s*/, '').slice(0, 10000),
      attachments,
    };
    console.log(`JTS_RESULT:${JSON.stringify(payload)}`);
  }
  onEnd(result: FullResult) {
    console.log(`JTS_SUMMARY:${JSON.stringify({ status: result.status })}`);
  }
}
export default JtsReporter;
