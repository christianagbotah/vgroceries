"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ProductMediaStudioProps {
  productId: string;
  productName: string;
}

export function ProductMediaStudio({ productId, productName }: ProductMediaStudioProps) {
  return (
    <section aria-labelledby="product-media-studio-heading" data-product-id={productId}>
      <Card>
        <CardHeader>
          <CardTitle id="product-media-studio-heading">Product Media Studio</CardTitle>
          <CardDescription>
            Manage approved product photography and AI-assisted media for {productName}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Upload, generation, review and publishing controls are loading into this workspace.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
