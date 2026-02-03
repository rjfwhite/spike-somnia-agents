// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

library BytesLib {
    function equal(bytes storage a, bytes storage b) internal view returns (bool) {
        if (a.length != b.length) {
            return false;
        }
        for (uint256 i = 0; i < a.length; i++) {
            if (a[i] != b[i]) {
                return false;
            }
        }
        return true;
    }
}

library MathLib {
    function median(uint256[] memory values) internal pure returns (uint256) {
        if (values.length == 0) {
            return 0;
        }
        if (values.length == 1) {
            return values[0];
        }

        // Sort the array (insertion sort - efficient for small arrays)
        for (uint256 i = 1; i < values.length; i++) {
            uint256 key = values[i];
            uint256 j = i;
            while (j > 0 && values[j - 1] > key) {
                values[j] = values[j - 1];
                j--;
            }
            values[j] = key;
        }

        // Return median
        uint256 mid = values.length / 2;
        if (values.length % 2 == 0) {
            // Even number: average of two middle values
            return (values[mid - 1] + values[mid]) / 2;
        } else {
            // Odd number: middle value
            return values[mid];
        }
    }
}
