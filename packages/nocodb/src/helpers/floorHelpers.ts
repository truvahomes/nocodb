import { UITypes } from "nocodb-sdk";
import { Column } from "src/models";
export function isFloorSetColumn(column: Column): boolean {
    return (
        column.uidt === UITypes.SingleSelect || 
        column.uidt === UITypes.MultiSelect
    ) && column?.meta?.is_floor_set;
  }
  
  export function generateFloorSet(): { title: string; order: number }[] {
    const values: string[] = [];
    
    // Add individual numbers 0-100
    for (let i = 0; i <= 100; i++) {
      values.push(i.toString());
    }
  
    // Add ranges
    for (let i = 0; i < 100; i++) {
      for (let j = i + 1; j <= 100; j++) {
        values.push(`${i} to ${j}`);
      }
    }
  
    // Add extra numeric values
    values.push('00');
    values.push('000');

    // Add String values
    values.push('Unknown');
    values.push('All');
    values.push('None');
    values.push('Odd');
    values.push('Even');
  
    values.push('P');
    values.push('P1');
    values.push('P2');
    values.push('P3');
    values.push('P4');
    values.push('P5');
    values.push('P6');
  
    values.push('B');
    values.push('B1');
    values.push('B2');
    values.push('B3');
    values.push('B4');
    values.push('B5');
    values.push('B6');

    values.push('G');
    values.push('L');
    values.push('LG');
    values.push('UG');
    
    values.push('S');
    values.push('S1');
    values.push('S2');

    values.push('12A');
  
    return values.map((value, index) => ({
      title: value,
      order: index + 1
    }));
  }

  export function generateFloorSetString(): string {
    const values: string[] = [];
    
    // Add individual numbers 0-100
    for (let i = 0; i <= 100; i++) {
      values.push(i.toString());
    }
  
    // Add ranges
    for (let i = 0; i < 100; i++) {
      for (let j = i + 1; j <= 100; j++) {
        values.push(`${i} to ${j}`);
      }
    }
  
    // Add extra numeric values
    values.push('00');
    values.push('000');

    // Add String values
    values.push('Unknown');
    values.push('All');
    values.push('None');
    values.push('Odd');
    values.push('Even');
  
    values.push('P');
    values.push('P1');
    values.push('P2');
    values.push('P3');
    values.push('P4');
    values.push('P5');
    values.push('P6');
  
    values.push('B');
    values.push('B1');
    values.push('B2');
    values.push('B3');
    values.push('B4');
    values.push('B5');
    values.push('B6');
  
    values.push('G');
    values.push('L');
    values.push('LG');
    values.push('UG');
    
    values.push('S');
    values.push('S1');
    values.push('S2');

    values.push('12A');
  
    return values.join(',');
  }