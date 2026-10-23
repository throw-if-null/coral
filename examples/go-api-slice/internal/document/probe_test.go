package document

import "testing"

func TestProbe_failsUnconditionally(t *testing.T) {
	t.Fatal("probe: this test fails so the go job runs red")
}
