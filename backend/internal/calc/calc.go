// Package calc implements the calculator's arithmetic on float64 values.
package calc

import (
	"errors"
	"math"
)

var (
	ErrDivisionByZero = errors.New("division by zero is not allowed")
	ErrNegativeSqrt   = errors.New("square root of a negative number is not allowed")
	ErrUndefined      = errors.New("result is undefined")
	ErrOutOfRange     = errors.New("result is out of range")
)

// BinaryOp is an arithmetic operation on two operands.
type BinaryOp func(a, b float64) (float64, error)

// UnaryOp is an arithmetic operation on a single operand.
type UnaryOp func(a float64) (float64, error)

func Add(a, b float64) (float64, error) {
	return checked(a + b)
}

func Subtract(a, b float64) (float64, error) {
	return checked(a - b)
}

func Multiply(a, b float64) (float64, error) {
	return checked(a * b)
}

func Divide(a, b float64) (float64, error) {
	if b == 0 {
		return 0, ErrDivisionByZero
	}
	return checked(a / b)
}

func Power(a, b float64) (float64, error) {
	result := math.Pow(a, b)
	// 0^-n is a division by zero; NaN comes from a negative base with a non-integer exponent.
	if (a == 0 && b < 0) || math.IsNaN(result) {
		return 0, ErrUndefined
	}
	return checked(result)
}

func Sqrt(a float64) (float64, error) {
	if a < 0 {
		return 0, ErrNegativeSqrt
	}
	return checked(math.Sqrt(a))
}

func Percent(a float64) (float64, error) {
	return checked(a / 100)
}

// checked rejects non-finite results and normalizes -0 to 0.
func checked(result float64) (float64, error) {
	if math.IsInf(result, 0) || math.IsNaN(result) {
		return 0, ErrOutOfRange
	}
	if result == 0 {
		return 0, nil
	}
	return result, nil
}
