import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function TrainingVideo({ videoUrl }: { videoUrl?: string }) {
  return (
    <Card className="mb-3">
      <CardHeader>
        <CardTitle>Training</CardTitle>
      </CardHeader>
      <CardContent>
        {videoUrl ? (
          <div className="w-full aspect-video bg-black">
            <video controls className="w-full h-full">
              <source src={videoUrl} />
              Your browser does not support the video tag.
            </video>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No training video configured. Please upload via admin panel.</div>
        )}
      </CardContent>
    </Card>
  );
}
