import Table from 'cli-table3'

export function createTable(headers: string[]): Table.Table {
  return new Table({
    head: headers,
    style: { head: ['cyan'] },
  })
}
