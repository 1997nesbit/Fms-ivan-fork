"use client"

import { useQuery } from "@tanstack/react-query"
import { Users } from "lucide-react"

import api from "@/lib/api"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import type { Technician } from "@/components/operations/types"

export function TechnicianRoster() {
  const { data: technicians = [], isLoading } = useQuery<Technician[]>({
    queryKey: ["technicians"],
    queryFn: async () => {
      const { data } = await api.get<{ results: Technician[] }>("/stock/technicians/")
      return data.results
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  if (technicians.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No technicians on record</EmptyTitle>
          <EmptyDescription>
            Technicians are managed by the Director. Once added they will appear
            here and become available for stage assignment.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        <Users className="size-4 shrink-0 text-primary" />
        {technicians.length} technician{technicians.length === 1 ? "" : "s"} available
        for assignment.
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Technician</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {technicians.map((tech) => (
              <TableRow key={tech.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  #{tech.id}
                </TableCell>
                <TableCell className="font-medium">{tech.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-medium">
                    Active
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
