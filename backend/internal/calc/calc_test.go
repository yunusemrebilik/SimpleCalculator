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

		{name: "power", op: Power, a: 2, b: 10, want: 1024},
		{name: "power negative exponent", op: Power, a: 2, b: -1, want: 0.5},
		{name: "power fractional exponent", op: Power, a: 9, b: 0.5, want: 3},
		{name: "power negative base integer exponent", op: Power, a: -2, b: 3, want: -8},
		{name: "power zero to zero", op: Power, a: 0, b: 0, want: 1},
		{name: "power zero to negative", op: Power, a: 0, b: -1, wantErr: ErrUndefined},
		{name: "power negative base fractional exponent", op: Power, a: -8, b: 1.0 / 3, wantErr: ErrUndefined},
		{name: "power overflow", op: Power, a: 10, b: 400, wantErr: ErrOutOfRange},
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
		{name: "power", op: Power, a: math.Copysign(0, -1), b: 3},
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

func TestUnaryOperations(t *testing.T) {
	tests := []struct {
		name    string
		op      UnaryOp
		a       float64
		want    float64
		wantErr error
	}{
		{name: "sqrt", op: Sqrt, a: 9, want: 3},
		{name: "sqrt irrational", op: Sqrt, a: 2, want: math.Sqrt2},
		{name: "sqrt zero", op: Sqrt, a: 0, want: 0},
		{name: "sqrt negative", op: Sqrt, a: -4, wantErr: ErrNegativeSqrt},

		{name: "percent", op: Percent, a: 70, want: 0.7},
		{name: "percent negative", op: Percent, a: -50, want: -0.5},
		{name: "percent large", op: Percent, a: math.MaxFloat64, want: math.MaxFloat64 / 100},
		{name: "percent underflow", op: Percent, a: math.SmallestNonzeroFloat64, want: 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := tt.op(tt.a)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("error = %v, want %v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("result = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestUnaryNegativeZeroIsNormalized(t *testing.T) {
	for name, op := range map[string]UnaryOp{"sqrt": Sqrt, "percent": Percent} {
		t.Run(name, func(t *testing.T) {
			got, err := op(math.Copysign(0, -1))
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != 0 || math.Signbit(got) {
				t.Errorf("result = %v (signbit %t), want +0", got, math.Signbit(got))
			}
		})
	}
}
