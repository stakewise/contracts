pragma solidity 0.5.16;

import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../collectors/Privates.sol";
import "../collectors/Pools.sol";
import "../Settings.sol";


contract ValidatorTransfers is Initializable {
    mapping(bytes32 => bool) public transferRequests;

    function registerDebt(bytes32 _fromEntityId, bytes32 _toEntityId, uint256 _debt, uint256 _maintainerFee) {

    }

    function withdrawIncome(bytes32 _collectorEntityId, address payable _withdrawer) {
        bytes32 validator = entityValidators(_collectorEntityId);
        require(validator != "", "Entity is not attached to any validator.");
        require(paidValidators(validator), "Validator debt has not been transferred yet.");

        bytes32 userId = keccak256(abi.encodePacked(_collectorEntityId, msg.sender, _withdrawer));
        require(!withdrawnIncomes[userId], "The income has been already withdrawn.");
    }
}
