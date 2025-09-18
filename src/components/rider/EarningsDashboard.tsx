import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function EarningsDashboard({ daily = 0, weekly = 0, onRefresh }: { daily?: number; weekly?: number; onRefresh?: () => void }) {
  return (
    <Card className="mb-3">
      <CardHeader>
        <CardTitle>Earnings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Today</div>
            <div className="text-xl font-semibold">₹{daily}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">This Week</div>
            <div className="text-xl font-semibold">₹{weekly}</div>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={onRefresh}>Refresh</Button>
        </div>
      </CardContent>
    </Card>
  );
}
