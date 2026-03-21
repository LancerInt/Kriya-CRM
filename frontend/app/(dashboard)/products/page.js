"use client";
import { useEffect, useState } from "react";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/products/")
      .then((r) => setProducts(r.data.results || r.data))
      .finally(() => setLoading(false));
  }, []);

  const columns = [
    { key: "name", label: "Product", render: (row) => <span className="font-medium">{row.name}</span> },
    { key: "hsn_code", label: "HSN Code" },
    { key: "category", label: "Category" },
    { key: "base_price", label: "Base Price", render: (row) => row.base_price ? `$${Number(row.base_price).toLocaleString()}` : "\u2014" },
    { key: "unit", label: "Unit", render: (row) => row.unit || "MT" },
  ];

  return (
    <div>
      <PageHeader title="Products" subtitle={`${products.length} products`} />
      <DataTable columns={columns} data={products} loading={loading} emptyTitle="No products" emptyDescription="Add products via admin panel" />
    </div>
  );
}
