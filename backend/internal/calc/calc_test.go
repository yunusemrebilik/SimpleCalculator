package calc

import (
	"errors"
	"math"
	"testing"
)

func TestOperations(t *testing.T) {
	tests := []struct {
		name    string
		op      BinaryOp
		a, b    float64
		want    float64
		wantErr error
	}{
		{name: "add positives", op: Add, a: 2, b: 3, want: 5},
		{name: "add negatives", op: Add, a: -2.5, b: -1.5, want: -4},
		{name: "add fractions", op: Add, a: 0.1, b: 0.2, want: 0.30000000000000004},
		{name: "add overflow", op: Add, a: math.MaxFloat64, b: math.MaxFloat64, wantErr: ErrOutOfRange},

		{name: "subtract", op: Subtract, a: 10, b: 4, want: 6},
		{name: "subtract to negative", op: Subtract, a: 4, b: 10, want: -6},
		{name: "subtract overflow", op: Subtract, a: -math.MaxFloat64, b: math.MaxFloat64, wantErr: ErrOutOfRange},

		{name: "multiply", op: Multiply, a: 12, b: 3, want: 36},
		{name: "multiply by negative", op: Multiply, a: 12, b: -3.5, want: -42},
		{name: "multiply overflow", op: Multiply, a: 1e308, b: 10, wantErr: ErrOutOfRange},

		{name: "divide", op: Divide, a: 12.5, b: 4, want: 3.125},
		{name: "divide by negative", op: Divide, a: 9, b: -3, want: -3},
		{name: "divide by zero", op: Divide, a: 1, b: 0, wantErr: ErrDivisionByZero},
		{name: "divide zero by zero", op: Divide, a: 0, b: 0, wantErr: ErrDivisionByZero},
		{name: "divide overflow", op: Divide, a: 1e308, b: 1e-308, wantErr: ErrOutOfRange},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := tt.op(tt.a, tt.b)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("error = %v, want %v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("result = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestNegativeZeroIsNormalized(t *testing.T) {
	tests := []struct {
		name string
		op   BinaryOp
		a, b float64
	}{
		{name: "add", op: Add, a: math.Copysign(0, -1), b: math.Copysign(0, -1)},
		{name: "subtract", op: Subtract, a: math.Copysign(0, -1), b: 0},
		{name: "multiply", op: Multiply, a: -5, b: 0},
		{name: "divide", op: Divide, a: 0, b: -5},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := tt.op(tt.a, tt.b)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != 0 || math.Signbit(got) {
				t.Errorf("result = %v (signbit %t), want +0", got, math.Signbit(got))
			}
		})
	}
}
